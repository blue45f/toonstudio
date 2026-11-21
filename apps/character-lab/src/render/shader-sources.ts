/**
 * 캐릭터 커스텀 셰이더 소스(순수 문자열). GLSL(WebGL2)과 WGSL(WebGPU) 2벌을 같은 의미로 유지한다.
 *
 * 공통 정점 셰이더는 Babylon include(bones/morph/instances)를 써서 스키닝·morph 텍스처 모드를 그대로 지원한다.
 * 프래그먼트 변형: toon(계단 램프 + 얼굴 SDF 그림자 + 림 + 알베도/페인트 데칼), flat(밑색), normal(월드 법선),
 * id(부위/재질 ID), depth(선형 뷰 깊이 RGBA8 패킹 — readback.ts `packDepthRgba8`과 같은 식).
 * 참고: MToon 1.0 수식 구조(N·L 음영 → linearstep → mix(shade, base)), lilToon의 fwidth 밴드 AA 개념. 코드 복제 아님.
 */

/** ShaderStore 키 접두 */
export const CHARACTER_VERTEX_SHADER_NAME = "clCharacter";
export const TOON_FRAGMENT_SHADER_NAME = "clToon";
export const FLAT_FRAGMENT_SHADER_NAME = "clFlat";
export const NORMAL_FRAGMENT_SHADER_NAME = "clNormal";
export const ID_FRAGMENT_SHADER_NAME = "clId";
export const DEPTH_FRAGMENT_SHADER_NAME = "clDepth";

/** 정점 attribute(ShaderMaterial options.attributes). 스키닝·morph attribute는 ShaderMaterial이 자동 추가한다. */
export const CHARACTER_SHADER_ATTRIBUTES: readonly string[] = ["position", "normal", "uv"];
/**
 * glTF `COLOR_0`(키트의 회색 AO) attribute. 정점 셰이더가 `#ifdef TS_VERTEX_COLOR`일 때만 선언하고, 재질도 그때만 attribute 목록에 넣는다 —
 * 메시에 색 버퍼가 없는데 attribute를 선언하면 빈 버퍼가 0으로 읽혀 알베도가 검게 곱해지고, 목록에 항상 넣으면 morph attribute 모드(NullEngine·WebGL1)의
 * 동시 영향 타깃 수 예산을 쓸데없이 하나 줄이므로, 재질을 만들 때 메시가 색 버퍼를 가진 파츠에만 켠다(`createPassMaterial`).
 */
export const CHARACTER_SHADER_VERTEX_COLOR_ATTRIBUTE = "color";
/** 메시의 정점 색(`COLOR_0` 회색 AO)을 알베도에 곱하는 define. 툰·밑색 패스만 곱하고 나머지 패스는 값을 쓰지 않는다. */
export const CHARACTER_SHADER_VERTEX_COLOR_DEFINE = "#define TS_VERTEX_COLOR";
/** ShaderMaterial이 자동 바인딩하는 행렬·카메라 uniform */
export const CHARACTER_SHADER_BASE_UNIFORMS: readonly string[] = ["world", "view", "viewProjection", "cameraPosition"];
/** WGSL 전용 UBO 이름 */
export const CHARACTER_SHADER_UNIFORM_BUFFERS: readonly string[] = ["Scene", "Mesh"];
/** morph normal·uv 변형을 켜는 define */
export const CHARACTER_SHADER_DEFINES: readonly string[] = ["#define NORMAL", "#define UV1"];

export const TOON_UNIFORMS: readonly string[] = [
  "baseColor",
  "shadeTint",
  "lightColor",
  "ambientColor",
  "toLight",
  "rimColor",
  "toonParams",
  "faceParams",
  "alphaParams",
  "mangaParams",
  "gradeParams",
  "matcapParams",
  "hairSpecParams",
];
export const TOON_SAMPLERS: readonly string[] = ["albedoSampler", "paintSampler", "sdfSampler"];
export const FLAT_UNIFORMS: readonly string[] = ["baseColor", "toonParams", "faceParams", "alphaParams"];
export const FLAT_SAMPLERS: readonly string[] = ["albedoSampler", "paintSampler"];
export const ID_UNIFORMS: readonly string[] = ["idColor"];
/** depthRange: x=near, y=far(카메라 뷰 깊이, m), z·w 예비 */
export const DEPTH_UNIFORMS: readonly string[] = ["depthRange"];

/**
 * SHAPER MaterialData::ApplyShadeLine(0x06000236) 3차(Cubic) MatCap 램프 GLSL/WGSL 보조 함수 스니펫:
 * width = (5.0 - 5.0 * w)^3, offset = -(width - 1.0) * 0.5 + pos * width
 */
export const CUBIC_MATCAP_RAMP_SNIPPET_GLSL = `float computeCubicMatCapRamp(float shading, float pos, float widthSlider) {
  float w = clamp(widthSlider, 0.0, 1.0);
  float p = clamp(pos, 0.0, 1.0);
  float base = 5.0 - 5.0 * w;
  float scaleU = base * base * base;
  float offsetU = -(scaleU - 1.0) * 0.5 + p * scaleU;
  return smoothstep(0.0, 1.0, shading * scaleU + offsetU);
}`;

export const CUBIC_MATCAP_RAMP_SNIPPET_WGSL = `fn computeCubicMatCapRamp(shading: f32, pos: f32, widthSlider: f32) -> f32 {
  let w: f32 = clamp(widthSlider, 0.0, 1.0);
  let p: f32 = clamp(pos, 0.0, 1.0);
  let base: f32 = 5.0 - 5.0 * w;
  let scaleU: f32 = base * base * base;
  let offsetU: f32 = -(scaleU - 1.0) * 0.5 + p * scaleU;
  return smoothstep(0.0, 1.0, shading * scaleU + offsetU);
}`;

export const CHARACTER_VERTEX_GLSL = `precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
#ifdef TS_FACE_SHADOW_UV
attribute vec2 uv2;
varying vec2 vFaceUV;
#else
#ifdef TS_HAIR_FLOW_UV
attribute vec2 uv2;
varying vec2 vHairFlowUV;
#endif
#endif
#ifdef TS_VERTEX_COLOR
attribute vec4 color;
#endif
#include<bonesDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<instancesDeclaration>
uniform mat4 view;
uniform mat4 viewProjection;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
varying vec4 vColor;
void main(void) {
  vec3 positionUpdated = position;
  vec3 normalUpdated = normal;
  vec2 uvUpdated = uv;
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
  vec4 worldPos = finalWorld * vec4(positionUpdated, 1.0);
  vPositionW = worldPos.xyz;
  vNormalW = normalize(mat3(finalWorld) * normalUpdated);
  vUV = uvUpdated;
#ifdef TS_FACE_SHADOW_UV
  vFaceUV = uv2;
#else
#ifdef TS_HAIR_FLOW_UV
  vHairFlowUV = uv2;
#endif
#endif
  vViewZ = -(view * worldPos).z;
#ifdef TS_VERTEX_COLOR
  vColor = color;
#else
  vColor = vec4(1.0);
#endif
  gl_Position = viewProjection * worldPos;
}
`;

export const CHARACTER_VERTEX_WGSL = `#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
#ifdef TS_FACE_SHADOW_UV
attribute uv2: vec2f;
varying vFaceUV: vec2f;
#else
#ifdef TS_HAIR_FLOW_UV
attribute uv2: vec2f;
varying vHairFlowUV: vec2f;
#endif
#endif
#ifdef TS_VERTEX_COLOR
attribute color: vec4f;
#endif
#include<bonesDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<instancesDeclaration>
varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
varying vColor: vec4f;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  var positionUpdated: vec3f = vertexInputs.position;
  var normalUpdated: vec3f = vertexInputs.normal;
  var uvUpdated: vec2f = vertexInputs.uv;
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
  let worldPos: vec4f = finalWorld * vec4f(positionUpdated, 1.0);
  vertexOutputs.vPositionW = worldPos.xyz;
  vertexOutputs.vNormalW = normalize(mat3x3f(finalWorld[0].xyz, finalWorld[1].xyz, finalWorld[2].xyz) * normalUpdated);
  vertexOutputs.vUV = uvUpdated;
#ifdef TS_FACE_SHADOW_UV
  vertexOutputs.vFaceUV = vertexInputs.uv2;
#else
#ifdef TS_HAIR_FLOW_UV
  vertexOutputs.vHairFlowUV = vertexInputs.uv2;
#endif
#endif
  vertexOutputs.vViewZ = -(scene.view * worldPos).z;
#ifdef TS_VERTEX_COLOR
  vertexOutputs.vColor = vertexInputs.color;
#else
  vertexOutputs.vColor = vec4f(1.0);
#endif
  vertexOutputs.position = scene.viewProjection * worldPos;
}
`;

/**
 * toonParams: x=rampSteps(2..4), y=rim(0/1), z=faceSdf(0/1), w=hasPaint(0/1)
 * faceParams: x=threshold(0.5·(1−fdotl)), y=flipU(0/1), z=sdfOffset, w=hasAlbedo(0/1)
 * alphaParams: x=alphaCutoff(알베도 텍스처 알파가 이 값보다 작은 텍셀을 버린다. 0 = 끔) — glTF `alphaMode: MASK`(키트의 눈썹·속눈썹 컷아웃)를 따른다. BLEND는 지원하지 않는다.
 * matcapParams: x=cubicMatCapWeight(0..1), y=cubicMatCapPos(0..1), z=cubicMatCapWidth(0..1), w=directionalBacklightRimGate(0..1)
 * hairSpecParams: x=hairAngelRingIntensity(0..1), y=primaryBandCenter(0..1), z=bandWidth, w=secondaryWeight(0..1)
 * vColor: 메시 `COLOR_0`(키트: 회색 AO, R=G=B). 알베도(밑색 × 알베도 텍스처, 페인트 합성)에 곱한다. 정점 색이 없는 메시는 1이다(PBR의 `surfaceAlbedo *= vColor.rgb`와 같은 자리).
 * 텍스처 샘플은 균일 제어 흐름을 위해 분기 밖에서 한 번만 읽는다(WGSL 규칙).
 */
export const TOON_FRAGMENT_GLSL = `precision highp float;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
varying vec4 vColor;
uniform vec3 cameraPosition;
uniform vec3 baseColor;
#ifdef TS_FACE_SHADOW_UV
varying vec2 vFaceUV;
#else
#ifdef TS_HAIR_FLOW_UV
varying vec2 vHairFlowUV;
#endif
#endif
uniform vec3 shadeTint;
uniform vec3 lightColor;
uniform vec3 ambientColor;
uniform vec3 toLight;
uniform vec3 rimColor;
uniform vec4 toonParams;
uniform vec4 faceParams;
uniform vec4 alphaParams;
uniform vec4 mangaParams;
uniform vec4 gradeParams;
uniform vec4 matcapParams;
uniform vec4 hairSpecParams;
uniform sampler2D albedoSampler;
uniform sampler2D paintSampler;
uniform sampler2D sdfSampler;
${CUBIC_MATCAP_RAMP_SNIPPET_GLSL}
void main(void) {
  vec3 n = normalize(vNormalW);
  vec4 albedoTex = texture2D(albedoSampler, vUV);
  vec4 paint = texture2D(paintSampler, vUV);
#ifdef TS_FACE_SHADOW_UV
  vec2 faceUV = vFaceUV;
#else
  vec2 faceUV = vUV;
#endif
  float sdfU = mix(faceUV.x, 1.0 - faceUV.x, step(0.5, faceParams.y));
  float sdf = texture2D(sdfSampler, vec2(sdfU, faceUV.y)).r;
  if (alphaParams.x > 0.0 && albedoTex.a < alphaParams.x) discard;
  vec3 base = mix(baseColor, baseColor * albedoTex.rgb, step(0.5, faceParams.w));
  vec3 albedo = mix(base, mix(base, paint.rgb, paint.a), step(0.5, toonParams.w)) * vColor.rgb;
  vec3 lightDir = normalize(toLight);
  float lambert = dot(n, lightDir) * 0.5 + 0.5;
  float sdfW = fwidth(sdf) + 0.002 + gradeParams.w * 0.08;
  float faceLit = smoothstep(faceParams.x - sdfW, faceParams.x + sdfW, sdf + faceParams.z);
  float faceShading = mix(0.25, 0.85, faceLit);
  float shading = mix(lambert, faceShading, step(0.5, toonParams.z));
  float steps = max(2.0, toonParams.x);
  float w = fwidth(shading) + 0.002 + gradeParams.w * 0.12;
  float acc = 0.0;
  for (int j = 1; j < 4; j++) {
    float fj = float(j);
    if (fj < steps) {
      float thr = fj / steps;
      acc += smoothstep(thr - w, thr + w, shading);
    }
  }
  float steppedBand = acc / (steps - 1.0);
  float cubicBand = computeCubicMatCapRamp(shading, matcapParams.y, matcapParams.z);
  float band = mix(steppedBand, cubicBand, clamp(matcapParams.x, 0.0, 1.0));
  vec3 shadeColor = albedo * shadeTint;
  vec3 color = mix(shadeColor, albedo, band) * lightColor + albedo * ambientColor;
  vec3 v = normalize(cameraPosition - vPositionW);
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float backlightAlign = clamp(dot(v, -lightDir) * 0.5 + 0.5, 0.0, 1.0);
  float rimLightSide = smoothstep(-0.25, 0.35, dot(n, lightDir));
  float directionalGate = clamp(mix(rimLightSide, max(rimLightSide, backlightAlign), 0.55), 0.15, 1.0);
  float rimGate = mix(1.0, directionalGate, clamp(matcapParams.w, 0.0, 1.0));
  float rim = smoothstep(0.55, 0.65, fresnel) * rimGate * step(0.5, toonParams.y);
  color += rimColor * rim;
  if (hairSpecParams.x > 0.0) {
#ifdef TS_HAIR_FLOW_UV
    vec2 hairUV = vHairFlowUV;
#else
    vec2 hairUV = vUV;
#endif
    vec3 tangent = normalize(cross(n, vec3(1.0, 0.0, 0.0)) + vec3(0.0, 0.0001, 0.0));
    vec3 halfVec = normalize(lightDir + v);
    float tDotH = dot(tangent, halfVec);
    float sinTH = sqrt(max(0.0, 1.0 - tDotH * tDotH));
    float primaryCenter = hairSpecParams.y;
    float bandW = max(0.02, hairSpecParams.z);
    float strandJitter = sin(hairUV.x * 37.6991) * 0.025;
    float flowCoord = clamp(hairUV.y + strandJitter, 0.0, 1.0);
    float primaryMask = 1.0 - smoothstep(bandW * 0.45, bandW, abs(flowCoord - primaryCenter));
    float secondaryMask = 1.0 - smoothstep(bandW * 0.7, bandW * 1.45, abs(flowCoord - (primaryCenter - bandW * 1.35)));
    float kkPrimary = pow(sinTH, 24.0) * primaryMask;
    float kkSecondary = pow(sinTH, 10.0) * secondaryMask * hairSpecParams.w;
    float litGate = smoothstep(0.2, 0.65, lambert);
    vec3 specTint = mix(albedo * 1.35 + vec3(0.18), lightColor, 0.45);
    color += specTint * (kkPrimary + kkSecondary) * hairSpecParams.x * litGate;
  }
  if (mangaParams.x > 0.5 && mangaParams.y > 0.0) {
    float cs = cos(mangaParams.w);
    float sn = sin(mangaParams.w);
    vec2 p = vPositionW.xy * mangaParams.z * 4.5;
    vec2 rp = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
    vec2 cell = fract(rp) - 0.5;
    float shadowMask = clamp(1.0 - band, 0.0, 1.0);
    float pat = 0.0;
    if (mangaParams.x < 1.5) {
      float rad = sqrt(shadowMask) * 0.62;
      pat = 1.0 - smoothstep(rad - 0.06, rad + 0.06, length(cell));
    } else if (mangaParams.x < 2.5) {
      float hw = shadowMask * 0.36;
      pat = 1.0 - smoothstep(hw - 0.05, hw + 0.05, abs(cell.y));
    } else {
      float hw1 = shadowMask * 0.30;
      float h1 = 1.0 - smoothstep(hw1 - 0.05, hw1 + 0.05, abs(cell.y));
      float h2 = step(0.45, shadowMask) * (1.0 - smoothstep(hw1 * 0.8 - 0.05, hw1 * 0.8 + 0.05, abs(cell.x)));
      pat = max(h1, h2);
    }
    vec3 inkCol = mix(albedo * shadeTint * 0.55, vec3(0.05, 0.04, 0.06), step(0.5, gradeParams.z));
    color = mix(color, inkCol, pat * mangaParams.y * shadowMask);
  }
  if (abs(gradeParams.x - 1.0) > 1e-4 || abs(gradeParams.y) > 1e-4) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = max(vec3(0.0), mix(vec3(luma), color, gradeParams.x) + vec3(gradeParams.y));
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

export const TOON_FRAGMENT_WGSL = `varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
varying vColor: vec4f;
uniform cameraPosition: vec3f;
uniform baseColor: vec3f;
#ifdef TS_FACE_SHADOW_UV
varying vFaceUV: vec2f;
#else
#ifdef TS_HAIR_FLOW_UV
varying vHairFlowUV: vec2f;
#endif
#endif
uniform shadeTint: vec3f;
uniform lightColor: vec3f;
uniform ambientColor: vec3f;
uniform toLight: vec3f;
uniform rimColor: vec3f;
uniform toonParams: vec4f;
uniform faceParams: vec4f;
uniform alphaParams: vec4f;
uniform mangaParams: vec4f;
uniform gradeParams: vec4f;
uniform matcapParams: vec4f;
uniform hairSpecParams: vec4f;
var albedoSampler: texture_2d<f32>;
var albedoSamplerSampler: sampler;
var paintSampler: texture_2d<f32>;
var paintSamplerSampler: sampler;
var sdfSampler: texture_2d<f32>;
var sdfSamplerSampler: sampler;
${CUBIC_MATCAP_RAMP_SNIPPET_WGSL}
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let n: vec3f = normalize(fragmentInputs.vNormalW);
  let albedoTex: vec4f = textureSample(albedoSampler, albedoSamplerSampler, fragmentInputs.vUV);
  let paint: vec4f = textureSample(paintSampler, paintSamplerSampler, fragmentInputs.vUV);
#ifdef TS_FACE_SHADOW_UV
  let faceUV = fragmentInputs.vFaceUV;
#else
  let faceUV = fragmentInputs.vUV;
#endif
  let sdfU: f32 = mix(faceUV.x, 1.0 - faceUV.x, step(0.5, uniforms.faceParams.y));
  let sdf: f32 = textureSample(sdfSampler, sdfSamplerSampler, vec2f(sdfU, faceUV.y)).r;
  if (uniforms.alphaParams.x > 0.0 && albedoTex.a < uniforms.alphaParams.x) {
    discard;
  }
  let base: vec3f = mix(uniforms.baseColor, uniforms.baseColor * albedoTex.rgb, step(0.5, uniforms.faceParams.w));
  let albedo: vec3f = mix(base, mix(base, paint.rgb, paint.a), step(0.5, uniforms.toonParams.w)) * fragmentInputs.vColor.rgb;
  let lightDir: vec3f = normalize(uniforms.toLight);
  let lambert: f32 = dot(n, lightDir) * 0.5 + 0.5;
  let sdfW: f32 = fwidth(sdf) + 0.002 + uniforms.gradeParams.w * 0.08;
  let faceLit: f32 = smoothstep(uniforms.faceParams.x - sdfW, uniforms.faceParams.x + sdfW, sdf + uniforms.faceParams.z);
  let faceShading: f32 = mix(0.25, 0.85, faceLit);
  let shading: f32 = mix(lambert, faceShading, step(0.5, uniforms.toonParams.z));
  let steps: f32 = max(2.0, uniforms.toonParams.x);
  let w: f32 = fwidth(shading) + 0.002 + uniforms.gradeParams.w * 0.12;
  var acc: f32 = 0.0;
  for (var j: i32 = 1; j < 4; j = j + 1) {
    let fj: f32 = f32(j);
    if (fj < steps) {
      let thr: f32 = fj / steps;
      acc = acc + smoothstep(thr - w, thr + w, shading);
    }
  }
  let steppedBand: f32 = acc / (steps - 1.0);
  let cubicBand: f32 = computeCubicMatCapRamp(shading, uniforms.matcapParams.y, uniforms.matcapParams.z);
  let band: f32 = mix(steppedBand, cubicBand, clamp(uniforms.matcapParams.x, 0.0, 1.0));
  let shadeColor: vec3f = albedo * uniforms.shadeTint;
  var color: vec3f = mix(shadeColor, albedo, band) * uniforms.lightColor + albedo * uniforms.ambientColor;
  let v: vec3f = normalize(uniforms.cameraPosition - fragmentInputs.vPositionW);
  let fresnel: f32 = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  let backlightAlign: f32 = clamp(dot(v, -lightDir) * 0.5 + 0.5, 0.0, 1.0);
  let rimLightSide: f32 = smoothstep(-0.25, 0.35, dot(n, lightDir));
  let directionalGate: f32 = clamp(mix(rimLightSide, max(rimLightSide, backlightAlign), 0.55), 0.15, 1.0);
  let rimGate: f32 = mix(1.0, directionalGate, clamp(uniforms.matcapParams.w, 0.0, 1.0));
  let rim: f32 = smoothstep(0.55, 0.65, fresnel) * rimGate * step(0.5, uniforms.toonParams.y);
  color = color + uniforms.rimColor * rim;
  if (uniforms.hairSpecParams.x > 0.0) {
#ifdef TS_HAIR_FLOW_UV
    let hairUV: vec2f = fragmentInputs.vHairFlowUV;
#else
    let hairUV: vec2f = fragmentInputs.vUV;
#endif
    let tangent: vec3f = normalize(cross(n, vec3f(1.0, 0.0, 0.0)) + vec3f(0.0, 0.0001, 0.0));
    let halfVec: vec3f = normalize(lightDir + v);
    let tDotH: f32 = dot(tangent, halfVec);
    let sinTH: f32 = sqrt(max(0.0, 1.0 - tDotH * tDotH));
    let primaryCenter: f32 = uniforms.hairSpecParams.y;
    let bandW: f32 = max(0.02, uniforms.hairSpecParams.z);
    let strandJitter: f32 = sin(hairUV.x * 37.6991) * 0.025;
    let flowCoord: f32 = clamp(hairUV.y + strandJitter, 0.0, 1.0);
    let primaryMask: f32 = 1.0 - smoothstep(bandW * 0.45, bandW, abs(flowCoord - primaryCenter));
    let secondaryMask: f32 = 1.0 - smoothstep(bandW * 0.7, bandW * 1.45, abs(flowCoord - (primaryCenter - bandW * 1.35)));
    let kkPrimary: f32 = pow(sinTH, 24.0) * primaryMask;
    let kkSecondary: f32 = pow(sinTH, 10.0) * secondaryMask * uniforms.hairSpecParams.w;
    let litGate: f32 = smoothstep(0.2, 0.65, lambert);
    let specTint: vec3f = mix(albedo * 1.35 + vec3f(0.18), uniforms.lightColor, 0.45);
    color = color + specTint * (kkPrimary + kkSecondary) * uniforms.hairSpecParams.x * litGate;
  }
  if (uniforms.mangaParams.x > 0.5 && uniforms.mangaParams.y > 0.0) {
    let cs: f32 = cos(uniforms.mangaParams.w);
    let sn: f32 = sin(uniforms.mangaParams.w);
    let p: vec2f = fragmentInputs.vPositionW.xy * uniforms.mangaParams.z * 4.5;
    let rp: vec2f = vec2f(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
    let cell: vec2f = fract(rp) - vec2f(0.5, 0.5);
    let shadowMask: f32 = clamp(1.0 - band, 0.0, 1.0);
    var pat: f32 = 0.0;
    if (uniforms.mangaParams.x < 1.5) {
      let rad: f32 = sqrt(shadowMask) * 0.62;
      pat = 1.0 - smoothstep(rad - 0.06, rad + 0.06, length(cell));
    } else if (uniforms.mangaParams.x < 2.5) {
      let hw: f32 = shadowMask * 0.36;
      pat = 1.0 - smoothstep(hw - 0.05, hw + 0.05, abs(cell.y));
    } else {
      let hw1: f32 = shadowMask * 0.30;
      let h1: f32 = 1.0 - smoothstep(hw1 - 0.05, hw1 + 0.05, abs(cell.y));
      let h2: f32 = step(0.45, shadowMask) * (1.0 - smoothstep(hw1 * 0.8 - 0.05, hw1 * 0.8 + 0.05, abs(cell.x)));
      pat = max(h1, h2);
    }
    let inkCol: vec3f = mix(albedo * uniforms.shadeTint * 0.55, vec3f(0.05, 0.04, 0.06), step(0.5, uniforms.gradeParams.z));
    color = mix(color, inkCol, pat * uniforms.mangaParams.y * shadowMask);
  }
  if (abs(uniforms.gradeParams.x - 1.0) > 1e-4 || abs(uniforms.gradeParams.y) > 1e-4) {
    let luma: f32 = dot(color, vec3f(0.2126, 0.7152, 0.0722));
    color = max(vec3f(0.0), mix(vec3f(luma), color, uniforms.gradeParams.x) + vec3f(uniforms.gradeParams.y));
  }
  fragmentOutputs.color = vec4f(color, 1.0);
}
`;

/** 밑색: baseColor(×알베도 텍스처)(+페인트 데칼), 조명·톤맵 없음 */
export const FLAT_FRAGMENT_GLSL = `precision highp float;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
varying vec4 vColor;
uniform vec3 baseColor;
uniform vec4 toonParams;
uniform vec4 faceParams;
uniform vec4 alphaParams;
uniform sampler2D albedoSampler;
uniform sampler2D paintSampler;
void main(void) {
  vec4 albedoTex = texture2D(albedoSampler, vUV);
  vec4 paint = texture2D(paintSampler, vUV);
  if (alphaParams.x > 0.0 && albedoTex.a < alphaParams.x) discard;
  vec3 base = mix(baseColor, baseColor * albedoTex.rgb, step(0.5, faceParams.w));
  vec3 albedo = mix(base, mix(base, paint.rgb, paint.a), step(0.5, toonParams.w)) * vColor.rgb;
  gl_FragColor = vec4(albedo, 1.0);
}
`;

export const FLAT_FRAGMENT_WGSL = `varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
varying vColor: vec4f;
uniform baseColor: vec3f;
uniform toonParams: vec4f;
uniform faceParams: vec4f;
uniform alphaParams: vec4f;
var albedoSampler: texture_2d<f32>;
var albedoSamplerSampler: sampler;
var paintSampler: texture_2d<f32>;
var paintSamplerSampler: sampler;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let albedoTex: vec4f = textureSample(albedoSampler, albedoSamplerSampler, fragmentInputs.vUV);
  let paint: vec4f = textureSample(paintSampler, paintSamplerSampler, fragmentInputs.vUV);
  if (uniforms.alphaParams.x > 0.0 && albedoTex.a < uniforms.alphaParams.x) {
    discard;
  }
  let base: vec3f = mix(uniforms.baseColor, uniforms.baseColor * albedoTex.rgb, step(0.5, uniforms.faceParams.w));
  let albedo: vec3f = mix(base, mix(base, paint.rgb, paint.a), step(0.5, uniforms.toonParams.w)) * fragmentInputs.vColor.rgb;
  fragmentOutputs.color = vec4f(albedo, 1.0);
}
`;

/** 월드 법선 n·0.5+0.5 */
export const NORMAL_FRAGMENT_GLSL = `precision highp float;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
varying vec4 vColor;
void main(void) {
  vec3 n = normalize(vNormalW) * 0.5 + 0.5;
  gl_FragColor = vec4(n, 1.0);
}
`;

export const NORMAL_FRAGMENT_WGSL = `varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
varying vColor: vec4f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let n: vec3f = normalize(fragmentInputs.vNormalW) * 0.5 + 0.5;
  fragmentOutputs.color = vec4f(n, 1.0);
}
`;

/** ID: idColor = (partId&255, partId>>8, materialId, 255)/255 상수 출력 */
export const ID_FRAGMENT_GLSL = `precision highp float;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
varying vec4 vColor;
uniform vec4 idColor;
void main(void) {
  gl_FragColor = idColor;
}
`;

export const ID_FRAGMENT_WGSL = `varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
varying vColor: vec4f;
uniform idColor: vec4f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  fragmentOutputs.color = uniforms.idColor;
}
`;

/**
 * 깊이: d = clamp((vViewZ − near)/(far − near), 0, 1)을 RGBA8 고정소수로 패킹(readback.ts packDepthRgba8과 동일).
 * d·255 = R + G/256 + B/65536 + A/16777216. 배경은 clear(1,0,0,0) = far.
 */
export const DEPTH_FRAGMENT_GLSL = `precision highp float;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
varying vec4 vColor;
uniform vec4 depthRange;
void main(void) {
  float d = clamp((vViewZ - depthRange.x) / max(depthRange.y - depthRange.x, 1e-6), 0.0, 1.0);
  float x = d * 255.0;
  float r = floor(x);
  float f1 = x - r;
  float g = floor(f1 * 256.0);
  float f2 = f1 * 256.0 - g;
  float b = floor(f2 * 256.0);
  float f3 = f2 * 256.0 - b;
  float a = min(255.0, floor(f3 * 256.0));
  gl_FragColor = vec4(r, min(255.0, g), min(255.0, b), a) / 255.0;
}
`;

export const DEPTH_FRAGMENT_WGSL = `varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
varying vColor: vec4f;
uniform depthRange: vec4f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let d: f32 = clamp((fragmentInputs.vViewZ - uniforms.depthRange.x) / max(uniforms.depthRange.y - uniforms.depthRange.x, 1e-6), 0.0, 1.0);
  let x: f32 = d * 255.0;
  let r: f32 = floor(x);
  let f1: f32 = x - r;
  let g: f32 = floor(f1 * 256.0);
  let f2: f32 = f1 * 256.0 - g;
  let b: f32 = floor(f2 * 256.0);
  let f3: f32 = f2 * 256.0 - b;
  let a: f32 = min(255.0, floor(f3 * 256.0));
  fragmentOutputs.color = vec4f(r, min(255.0, g), min(255.0, b), a) / 255.0;
}
`;

export interface ShaderPair {
  readonly glsl: string;
  readonly wgsl: string;
}

export type CharacterShaderKey = "vertex" | "toon" | "flat" | "normal" | "id" | "depth";

export const CHARACTER_SHADER_SOURCES: Readonly<Record<CharacterShaderKey, ShaderPair>> = Object.freeze({
  vertex: { glsl: CHARACTER_VERTEX_GLSL, wgsl: CHARACTER_VERTEX_WGSL },
  toon: { glsl: TOON_FRAGMENT_GLSL, wgsl: TOON_FRAGMENT_WGSL },
  flat: { glsl: FLAT_FRAGMENT_GLSL, wgsl: FLAT_FRAGMENT_WGSL },
  normal: { glsl: NORMAL_FRAGMENT_GLSL, wgsl: NORMAL_FRAGMENT_WGSL },
  id: { glsl: ID_FRAGMENT_GLSL, wgsl: ID_FRAGMENT_WGSL },
  depth: { glsl: DEPTH_FRAGMENT_GLSL, wgsl: DEPTH_FRAGMENT_WGSL },
});

/** 프래그먼트 키 → ShaderStore 이름 */
export const FRAGMENT_SHADER_NAMES: Readonly<Record<Exclude<CharacterShaderKey, "vertex">, string>> = Object.freeze({
  toon: TOON_FRAGMENT_SHADER_NAME,
  flat: FLAT_FRAGMENT_SHADER_NAME,
  normal: NORMAL_FRAGMENT_SHADER_NAME,
  id: ID_FRAGMENT_SHADER_NAME,
  depth: DEPTH_FRAGMENT_SHADER_NAME,
});

/** 셰이더 소스에서 `#include<name>` 이름을 순서대로 뽑는다(테스트·side-effect 점검용). */
export function listShaderIncludes(source: string): string[] {
  const out: string[] = [];
  const pattern = /#include<([a-zA-Z0-9_]+)>/gu;
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match) {
    out.push(match[1] ?? "");
    match = pattern.exec(source);
  }
  return out;
}

/** 두 언어가 같은 include 집합·순서를 쓰는지(의미 동치의 1차 조건) */
export const CHARACTER_VERTEX_INCLUDES: readonly string[] = listShaderIncludes(CHARACTER_VERTEX_GLSL);

/**
 * SHAPER MaterialData::SetValuesFromUI(0x06000235) 비등방성 펜선 외곽선(_Outline_W=1.5, _Outline_H=0.3) GLSL/WGSL 보조 스니펫.
 */
export const ANISOTROPIC_OUTLINE_VERTEX_SNIPPET_GLSL = `vec2 computeAnisotropicOutlineOffset(vec2 normalViewXY, float outlineBold, float outlinePressure) {
  vec2 aspect = mix(vec2(1.0, 1.0), vec2(1.5, 0.3), step(0.5, outlinePressure));
  return normalViewXY * outlineBold * aspect;
}`;

export const ANISOTROPIC_OUTLINE_VERTEX_SNIPPET_WGSL = `fn computeAnisotropicOutlineOffset(normalViewXY: vec2f, outlineBold: f32, outlinePressure: f32) -> vec2f {
  let aspect: vec2f = mix(vec2f(1.0, 1.0), vec2f(1.5, 0.3), step(0.5, outlinePressure));
  return normalViewXY * outlineBold * aspect;
}`;
